import type { Node } from 'web-tree-sitter';
import type { Span } from '../../extract-types.mts';
import { statementWindows } from '../../jvm-views.mts';
import { field, namedChildren, present, required } from '../syntax.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const OWN_SCOPES = new Set([
  'lambda_expression',
  'class_body',
  'method_declaration',
  'constructor_declaration',
]);

const TRIES = new Set(['try_statement', 'try_with_resources_statement']);

function ownBlocks(method: Node): Node[] {
  const found: Node[] = [];
  const pending = [required(method, 'body')];
  for (const node of pending) {
    if (node.type === 'block') {
      found.push(node);
    }
    appendAll(
      pending,
      node.namedChildren.filter((child) => !OWN_SCOPES.has(child.type)),
    );
  }
  return found;
}

function matches(window: readonly Node[], span: Span): boolean {
  return (
    present(window[0]).startPosition.row + 1 === span.start &&
    present(window.at(-1)).endPosition.row + 1 === span.end
  );
}

export function runStatements(method: Node, span: Span): Node[] | undefined {
  const found = ownBlocks(method)
    .flatMap((block) => statementWindows(namedChildren(block)))
    .filter((window) => matches(window, span));
  return found.length === 1 ? found[0] : undefined;
}

function ancestorsOf(node: Node): Node[] {
  const found: Node[] = [];
  const pending = [node.parent];
  for (const current of pending) {
    if (current !== null && current.type !== 'method_declaration') {
      found.push(current);
      pending.push(current.parent);
    }
  }
  return found;
}

function containsRun(tryNode: Node, statements: readonly Node[]): boolean {
  const body = field(tryNode, 'body');
  const first = present(statements[0]);
  const inBody =
    body !== undefined && first.startIndex >= body.startIndex && first.endIndex <= body.endIndex;
  return inBody && namedChildren(tryNode).some(({ type }) => type === 'catch_clause');
}

export function insideCatchingTry(statements: readonly Node[]): boolean {
  return ancestorsOf(present(statements[0]))
    .filter(({ type }) => TRIES.has(type))
    .some((tryNode) => containsRun(tryNode, statements));
}
