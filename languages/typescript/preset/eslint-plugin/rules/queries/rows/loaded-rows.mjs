import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { staticKey, unwrapped } from '../../security/security-values.mjs';
import { callChain } from '../query-calls.mjs';
import { homeOf, outerOf } from '../result-uses.mjs';

const PROJECTIONS = new Set(['select', 'columns', 'attributes', 'fields']);
const DRIZZLE_SELECTS = new Set(['select', 'selectDistinct']);

function isGuardRead(read) {
  const outer = outerOf(read);
  const member = outer.parent;
  const isLength =
    member.type === 'MemberExpression' &&
    member.object === outer &&
    !member.computed &&
    member.property.name === 'length';
  const path = [member, ...ancestorsOf(member)];
  const test = path.find(
    (node, index) => node.parent?.type === 'IfStatement' && node.parent.test === node && index >= 0,
  );
  return isLength && test !== undefined;
}

export function loadedRows(context, awaited) {
  const outer = outerOf(awaited);
  const declarator = outer.parent;
  if (declarator.type !== 'VariableDeclarator' || declarator.init !== outer) {
    return { reads: [outer], home: homeOf(outer) };
  }
  if (declarator.id.type !== 'Identifier') {
    return undefined;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  const writes = variable.references.filter((reference) => reference.isWrite());
  const reads = variable.references
    .filter((reference) => reference.isRead())
    .map((reference) => reference.identifier);
  return writes.length === 1
    ? { reads: reads.filter((read) => !isGuardRead(read)), home: homeOf(declarator) }
    : undefined;
}

export function singleRead(context, node) {
  const outer = outerOf(node);
  const declarator = outer.parent;
  if (declarator.type !== 'VariableDeclarator' || declarator.init !== outer) {
    return outer;
  }
  if (declarator.id.type !== 'Identifier') {
    return undefined;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  const reads = variable.references.filter((reference) => reference.isRead());
  return reads.length === 1 && variable.references.length === 2 ? reads[0].identifier : undefined;
}

function hasProjectionKey(argument) {
  const target = argument === undefined ? undefined : unwrapped(argument);
  return (
    target?.type === 'ObjectExpression' &&
    target.properties.some((property) => PROJECTIONS.has(staticKey(property)))
  );
}

export function isProjection(query) {
  const drizzle = callChain(query).some(
    (call) =>
      call.callee.type === 'MemberExpression' &&
      DRIZZLE_SELECTS.has(call.callee.property.name) &&
      call.arguments.length > 0,
  );
  return drizzle || query.arguments.some(hasProjectionKey);
}
