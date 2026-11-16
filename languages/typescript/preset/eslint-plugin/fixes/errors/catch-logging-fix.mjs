import { hasCommentIn, replacing } from '../support/ranges.mjs';

function isMessage(node) {
  return (
    (node.type === 'Literal' && typeof node.value === 'string') || node.type === 'TemplateLiteral'
  );
}

export function catchLoggingFix(sourceCode, call, isCaught) {
  const [first, second] = call.arguments;
  if (call.arguments.length !== 2 || hasCommentIn(sourceCode, call.range)) {
    return undefined;
  }
  const caught = isCaught(first) ? first : second;
  const message = caught === first ? second : first;
  const text = `{ err: ${sourceCode.getText(caught)} }, ${sourceCode.getText(message)}`;
  return isCaught(caught) && isMessage(message)
    ? replacing([first.range[0], second.range[1]], text)
    : undefined;
}
