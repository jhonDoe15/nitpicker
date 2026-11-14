import { statementWindows } from '../../../../../../shared/fix/recipes/extract/windows.mjs';
import { field, namedChildren } from '../syntax.mjs';

const OWN_SCOPES = new Set([
  'lambda_expression',
  'class_body',
  'method_declaration',
  'constructor_declaration',
]);

const TRIES = new Set(['try_statement', 'try_with_resources_statement']);

function ownBlocks(method) {
  const found = [];
  const pending = [field(method, 'body')];
  for (const node of pending) {
    if (node.type === 'block') {
      found.push(node);
    }
    pending.push(...node.namedChildren.filter((child) => !OWN_SCOPES.has(child.type)));
  }
  return found;
}

function matches(window, span) {
  return (
    window[0].startPosition.row + 1 === span.start && window.at(-1).endPosition.row + 1 === span.end
  );
}

export function runStatements(method, span) {
  const found = ownBlocks(method)
    .flatMap((block) => statementWindows(namedChildren(block)))
    .filter((window) => matches(window, span));
  return found.length === 1 ? found[0] : undefined;
}

function ancestorsOf(node) {
  const found = [];
  const pending = [node.parent];
  for (const current of pending) {
    if (current !== null && current.type !== 'method_declaration') {
      found.push(current);
      pending.push(current.parent);
    }
  }
  return found;
}

function containsRun(tryNode, statements) {
  const body = field(tryNode, 'body');
  const [first] = statements;
  const inBody =
    body !== undefined && first.startIndex >= body.startIndex && first.endIndex <= body.endIndex;
  return inBody && namedChildren(tryNode).some(({ type }) => type === 'catch_clause');
}

export function insideCatchingTry(statements) {
  return ancestorsOf(statements[0])
    .filter(({ type }) => TRIES.has(type))
    .some((tryNode) => containsRun(tryNode, statements));
}
